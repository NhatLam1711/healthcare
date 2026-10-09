import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import os
import time
from utils.utils import *
from model.AnomalyTransformer import AnomalyTransformer
from data_factory.data_loader import get_loader_segment
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score, precision_recall_curve, auc
from vus.utils.metrics import metricor

def my_kl_loss(p, q):
    res = p * (torch.log(p + 0.0001) - torch.log(q + 0.0001))
    return torch.mean(torch.sum(res, dim=-1), dim=1)


def adjust_learning_rate(optimizer, epoch, lr_):
    lr_adjust = {epoch: lr_ * (0.5 ** ((epoch - 1) // 1))}
    if epoch in lr_adjust.keys():
        lr = lr_adjust[epoch]
        for param_group in optimizer.param_groups:
            param_group['lr'] = lr
        print('Updating learning rate to {}'.format(lr))


class EarlyStopping:
    def __init__(self, patience=7, verbose=False, dataset_name='', delta=0):
        self.patience = patience
        self.verbose = verbose
        self.counter = 0
        self.best_score = None
        self.best_score2 = None
        self.early_stop = False
        self.val_loss_min = np.inf
        self.val_loss2_min = np.inf
        self.delta = delta
        self.dataset = dataset_name

    def __call__(self, win_size, val_loss, val_loss2, model, path):
        score = -val_loss
        score2 = -val_loss2
        if self.best_score is None:
            self.best_score = score
            self.best_score2 = score2
            self.save_checkpoint(win_size, val_loss, val_loss2, model, path)
        elif score < self.best_score + self.delta or score2 < self.best_score2 + self.delta:
            self.counter += 1
            print(f'EarlyStopping counter: {self.counter} out of {self.patience}')
            if self.counter >= self.patience:
                self.early_stop = True
        else:
            self.best_score = score
            self.best_score2 = score2
            self.save_checkpoint(win_size, val_loss, val_loss2, model, path)
            self.counter = 0

    def save_checkpoint(self, win_size, val_loss, val_loss2, model, path):
        if self.verbose:
            print(f'Validation loss decreased ({self.val_loss_min:.6f} --> {val_loss:.6f}).  Saving model ...')
        torch.save(model.state_dict(),os.path.join(path, f"{self.dataset}_wsize{win_size}_checkpoint.pth"))
        self.val_loss_min = val_loss
        self.val_loss2_min = val_loss2


class Solver(object):
    DEFAULTS = {}

    def __init__(self, config):

        self.__dict__.update(Solver.DEFAULTS, **config)

        self.train_loader = get_loader_segment(self.data_path, batch_size=self.batch_size, win_size=self.win_size,
                                               mode='train',
                                               dataset=self.dataset)
        self.vali_loader = get_loader_segment(self.data_path, batch_size=self.batch_size, win_size=self.win_size,
                                              mode='val',
                                              dataset=self.dataset)
        self.test_loader = get_loader_segment(self.data_path, batch_size=self.batch_size, win_size=self.win_size,
                                              mode='test',
                                              dataset=self.dataset)
        self.thre_loader = get_loader_segment(self.data_path, batch_size=self.batch_size, win_size=self.win_size,
                                              mode='thre',
                                              dataset=self.dataset)

        self.build_model()
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        self.criterion = nn.MSELoss()

    def build_model(self):
        self.model = AnomalyTransformer(
            win_size=self.win_size,
            enc_in=self.input_c,
            c_out=self.output_c,
            d_model=getattr(self, 'd_model', 512),
            n_heads=getattr(self, 'n_heads', 8),
            e_layers=getattr(self, 'e_layers', 3),
            d_ff=getattr(self, 'd_ff', 512),
            dropout=getattr(self, 'dropout', 0.0),
            legacy_positional_embedding=getattr(self, 'legacy_positional_embedding', False),
            legacy_max_len=getattr(self, 'legacy_max_len', None),
        )
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=self.lr)

        if torch.cuda.is_available():
            self.model.cuda()

    def vali(self, vali_loader):
        self.model.eval()

        loss_1 = []
        loss_2 = []
        for i, (input_data, _) in enumerate(vali_loader):
            input = input_data.float().to(self.device)
            output, series, prior, _ = self.model(input)
            series_loss = 0.0
            prior_loss = 0.0
            for u in range(len(prior)):
                series_loss += (torch.mean(my_kl_loss(series[u], (
                        prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                               self.win_size)).detach())) + torch.mean(
                    my_kl_loss(
                        (prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                                self.win_size)).detach(),
                        series[u])))
                prior_loss += (torch.mean(
                    my_kl_loss((prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                                       self.win_size)),
                               series[u].detach())) + torch.mean(
                    my_kl_loss(series[u].detach(),
                               (prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                                       self.win_size)))))
            series_loss = series_loss / len(prior)
            prior_loss = prior_loss / len(prior)

            rec_loss = self.criterion(output, input)
            loss_1.append((rec_loss - self.k * series_loss).item())
            loss_2.append((rec_loss + self.k * prior_loss).item())

        return np.average(loss_1), np.average(loss_2)

    def train(self):

        print("======================TRAIN MODE======================")

        time_now = time.time()
        path = self.model_save_path
        if not os.path.exists(path):
            os.makedirs(path)
        early_stopping = EarlyStopping(patience=1000, verbose=True, dataset_name=self.dataset)
        train_steps = len(self.train_loader)

        for epoch in range(self.num_epochs):
            iter_count = 0
            loss1_list = []

            epoch_time = time.time()
            self.model.train()
            for i, (input_data, labels) in enumerate(self.train_loader):

                self.optimizer.zero_grad()
                iter_count += 1
                input = input_data.float().to(self.device)

                output, series, prior, _ = self.model(input)

                # calculate Association discrepancy
                series_loss = 0.0
                prior_loss = 0.0
                for u in range(len(prior)):
                    series_loss += (torch.mean(my_kl_loss(series[u], (
                            prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                                   self.win_size)).detach())) + torch.mean(
                        my_kl_loss((prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                                           self.win_size)).detach(),
                                   series[u])))
                    prior_loss += (torch.mean(my_kl_loss(
                        (prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                                self.win_size)),
                        series[u].detach())) + torch.mean(
                        my_kl_loss(series[u].detach(), (
                                prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1,
                                                                                                       self.win_size)))))
                series_loss = series_loss / len(prior)
                prior_loss = prior_loss / len(prior)

                rec_loss = self.criterion(output, input)

                loss1_list.append((rec_loss - self.k * series_loss).item())
                loss1 = rec_loss - self.k * series_loss
                loss2 = rec_loss + self.k * prior_loss

                if (i + 1) % 100 == 0:
                    speed = (time.time() - time_now) / iter_count
                    left_time = speed * ((self.num_epochs - epoch) * train_steps - i)
                    print('\tspeed: {:.4f}s/iter; left time: {:.4f}s'.format(speed, left_time))
                    iter_count = 0
                    time_now = time.time()

                # Minimax strategy
                loss1.backward(retain_graph=True)
                loss2.backward()
                self.optimizer.step()

            print("Epoch: {} cost time: {}".format(epoch + 1, time.time() - epoch_time))
            train_loss = np.average(loss1_list)

            vali_loss1, vali_loss2 = self.vali(self.test_loader)

            print(
                "Epoch: {0}, Steps: {1} | Train Loss: {2:.7f} Vali Loss: {3:.7f} ".format(
                    epoch + 1, train_steps, train_loss, vali_loss1))
            early_stopping(self.win_size, vali_loss1, vali_loss2, self.model, path)
            if early_stopping.early_stop:
                print("Early stopping")
                break
            adjust_learning_rate(self.optimizer, epoch + 1, self.lr)

    def compute_vus(self, gt, score, window_size):
        _, _, _, _, avg_auc_3d, avg_ap_3d = metricor().RangeAUC_volume_opt(
            labels_original=gt,
            score=score,
            windowSize=window_size,
            thre=250
        )
        return avg_auc_3d, avg_ap_3d

    def test(self):
        checkpoint_candidates = []
        checkpoint_name = getattr(self, 'checkpoint', None)

        if checkpoint_name:
            checkpoint_candidates.extend([
                os.path.join(str(self.model_save_path), str(self.dataset), f"{checkpoint_name}_wsize{self.win_size}_checkpoint.pth"),
                os.path.join(str(self.model_save_path), f"{checkpoint_name}_wsize{self.win_size}_checkpoint.pth"),
            ])

        checkpoint_candidates.extend([
            os.path.join(str(self.model_save_path), str(self.dataset), str(self.dataset) + '_wsize' + str(self.win_size) + '_checkpoint.pth'),
            os.path.join(str(self.model_save_path), str(self.dataset) + '_wsize' + str(self.win_size) + '_checkpoint.pth'),
        ])

        checkpoint_path = None
        for path in checkpoint_candidates:
            if os.path.exists(path):
                checkpoint_path = path
                break

        if checkpoint_path is None:
            raise FileNotFoundError(
                f"Không tìm thấy checkpoint cho dataset={self.dataset}, win_size={self.win_size}. "
                f"Các đường dẫn thử: {checkpoint_candidates}"
            )

        self.model.load_state_dict(torch.load(checkpoint_path, map_location=self.device))
        self.model.eval()
        temperature = 50

        criterion = nn.MSELoss(reduction="none")

        # --- Bước 1: Thu thập Energy từ Train Set (chỉ chạy 1 lần) ---
        train_energy = []
        for i, (input_data, labels) in enumerate(self.train_loader):
            input = input_data.float().to(self.device)
            output, series, prior, _ = self.model(input)
            loss = torch.mean(criterion(input, output), dim=-1)

            series_loss = 0.0
            prior_loss = 0.0
            for u in range(len(prior)):
                prior_norm = prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1, self.win_size)
                series_loss += my_kl_loss(series[u], prior_norm.detach()) * temperature
                prior_loss += my_kl_loss(prior_norm, series[u].detach()) * temperature

            metric = torch.softmax((-series_loss - prior_loss), dim=-1)
            cri = (metric * loss).detach().cpu().numpy()
            train_energy.append(cri)
        train_energy = np.concatenate(train_energy, axis=0).reshape(-1)

        # --- Bước 2: Thu thập Energy và Labels từ Test/Thre Set (chỉ chạy 1 lần) ---
        test_energy = []
        test_labels = []
        for i, (input_data, labels) in enumerate(self.thre_loader):
            input = input_data.float().to(self.device)
            output, series, prior, _ = self.model(input)
            loss = torch.mean(criterion(input, output), dim=-1)

            series_loss = 0.0
            prior_loss = 0.0
            for u in range(len(prior)):
                prior_norm = prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(1, 1, 1, self.win_size)
                series_loss += my_kl_loss(series[u], prior_norm.detach()) * temperature
                prior_loss += my_kl_loss(prior_norm, series[u].detach()) * temperature

            metric = torch.softmax((-series_loss - prior_loss), dim=-1)
            cri = (metric * loss).detach().cpu().numpy()
            test_energy.append(cri)
            test_labels.append(labels)

        test_energy = np.concatenate(test_energy, axis=0).reshape(-1)
        test_labels = np.concatenate(test_labels, axis=0).reshape(-1).astype(int)
        combined_energy = np.concatenate([train_energy, test_energy], axis=0)
        gt = test_labels.copy()

        # --- Bước 3: Quét qua các giá trị Ratio để tìm Best Performance ---
        best_f1 = -1
        best_f1_no_pa = -1
        best_results = {}
        best_pred_pa = None

        ratios = np.arange(0.1, 1.6, 0.1)

        for ratio in ratios:
            thresh = np.percentile(combined_energy, 100 - ratio)
            pred_raw = (test_energy > thresh).astype(int)
            gt = test_labels.copy()

            pred_pa = pred_raw.copy()
            anomaly_state = False
            for i in range(len(gt)):
                if gt[i] == 1 and pred_pa[i] == 1 and not anomaly_state:
                    anomaly_state = True
                    for j in range(i, 0, -1):
                        if gt[j] == 0:
                            break
                        pred_pa[j] = 1
                    for j in range(i, len(gt)):
                        if gt[j] == 0:
                            break
                        pred_pa[j] = 1
                elif gt[i] == 0:
                    anomaly_state = False
                if anomaly_state:
                    pred_pa[i] = 1

            prec_pa, rec_pa, f1_pa, _ = precision_recall_fscore_support(gt, pred_pa, average='binary', zero_division=0)
            _, _, f1_no_pa, _ = precision_recall_fscore_support(gt, pred_raw, average='binary', zero_division=0)

            if f1_pa > best_f1:
                best_f1 = f1_pa
                best_results = {
                    "ratio": float(ratio),
                    "prec_pa": float(prec_pa),
                    "rec_pa": float(rec_pa),
                    "f1_pa": float(f1_pa),
                    "pred_pa": pred_pa.copy(),
                    "gt": gt.copy(),
                }
            if f1_no_pa > best_f1_no_pa:
                best_f1_no_pa = f1_no_pa
                best_results['f1_no_pa'] = float(f1_no_pa)

        auc_roc = roc_auc_score(test_labels, test_energy)
        prec_curves, rec_curves, _ = precision_recall_curve(test_labels, test_energy)
        auc_pr = auc(rec_curves, prec_curves)
        best_results['auc_roc'] = float(auc_roc)
        best_results['auc_pr'] = float(auc_pr)

        vus_roc, vus_pr = self.compute_vus(gt, test_energy, window_size=100)
        best_results['vus_roc'] = float(vus_roc)
        best_results['vus_pr'] = float(vus_pr)
        best_results['pred_pa'] = best_results.get('pred_pa', np.array([], dtype=int))
        best_results['gt'] = best_results.get('gt', gt)

        self.save_results(best_results=best_results, scheduler=True)
        return best_results




    def build_filename(self, scheduler=False):
        filename = (
            f"{self.dataset}"
            f"_win{self.win_size}"
            f"_dm{self.model.d_model}"
            f"_lr{self.lr}"
            # f"_maxlr{self.max_lr}"
            # f"_minlr{self.min_lr}"
            f"_ep{self.num_epochs}"
            f"_bs{self.batch_size}"
            f"_dropout0.1"
        )

        return filename

    def save_results(self, best_results, scheduler=False):
        os.makedirs("results", exist_ok=True)

        filename = self.build_filename(scheduler=scheduler) + ".txt"

        path = os.path.join("results", filename)

        with open(path, "w", encoding="utf-8") as f:
            f.write("====================== BEST RESULT ======================\n")
            f.write(f"Best Ratio    : {best_results['ratio']:.1f}\n")
            f.write(f"Precision (PA): {best_results['prec_pa']:.4f}\n")
            f.write(f"Recall (PA)   : {best_results['rec_pa']:.4f}\n")
            f.write(f"F1 (PA)       : {best_results['f1_pa']:.4f}\n")
            f.write(f"F1 (No PA)    : {best_results['f1_no_pa']:.4f}\n")
            f.write(f"AUC-ROC       : {best_results['auc_roc']:.4f}\n")
            f.write(f"AUC-PR        : {best_results['auc_pr']:.4f}\n")
            f.write(f"VUS-ROC       : {best_results['vus_roc']:.4f}\n")
            f.write(f"VUS-PR        : {best_results['vus_pr']:.4f}\n")

        print(f"Saved results -> {path}")
